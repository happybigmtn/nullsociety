use commonware_consensus::threshold_simplex::types::{Context, View};
use commonware_consensus::{Automaton, Relay, Reporter};
use commonware_cryptography::sha256::Digest;
use commonware_macros::select;
use commonware_runtime::{signal::Signal, telemetry::metrics::histogram, Clock};
use futures::{
    channel::{mpsc, oneshot},
    SinkExt,
};
use nullspace_types::{genesis_digest, Block, Seed};
use tracing::warn;

/// Messages sent to the application.
pub enum Message<E: Clock> {
    Genesis {
        response: oneshot::Sender<Digest>,
    },
    Propose {
        view: View,
        parent: (View, Digest),
        response: oneshot::Sender<Digest>,
    },
    Ancestry {
        view: View,
        blocks: Vec<Block>,
        timer: histogram::Timer<E>,
        response: oneshot::Sender<Digest>,
    },
    Broadcast {
        payload: Digest,
    },
    Verify {
        view: View,
        parent: (View, Digest),
        payload: Digest,
        response: oneshot::Sender<bool>,
    },
    Finalized {
        block: Block,
        response: oneshot::Sender<()>,
    },
    Seeded {
        block: Block,
        seed: Seed,
        timer: histogram::Timer<E>,
        response: oneshot::Sender<()>,
    },
}

/// Mailbox for the application.
#[derive(Clone)]
pub struct Mailbox<E: Clock> {
    sender: mpsc::Sender<Message<E>>,
    stopped: Signal,
}

impl<E: Clock> Mailbox<E> {
    pub(super) fn new(sender: mpsc::Sender<Message<E>>, stopped: Signal) -> Self {
        Self { sender, stopped }
    }

    pub(super) async fn ancestry(
        &mut self,
        view: View,
        blocks: Vec<Block>,
        timer: histogram::Timer<E>,
        response: oneshot::Sender<Digest>,
    ) {
        let mut sender = self.sender.clone();
        let mut stopped = self.stopped.clone();
        select! {
            result = sender.send(Message::Ancestry { view, blocks, timer, response }) => {
                if result.is_err() {
                    warn!(view, "application mailbox closed; ancestry dropped");
                }
            },
            _ = &mut stopped => {
                warn!(view, "application shutting down; ancestry dropped");
            }
        }
    }

    pub(super) async fn seeded(
        &mut self,
        block: Block,
        seed: Seed,
        timer: histogram::Timer<E>,
        response: oneshot::Sender<()>,
    ) {
        let mut sender = self.sender.clone();
        let mut stopped = self.stopped.clone();
        select! {
            result = sender.send(Message::Seeded { block, seed, timer, response }) => {
                if result.is_err() {
                    warn!("application mailbox closed; seeded dropped");
                }
            },
            _ = &mut stopped => {
                warn!("application shutting down; seeded dropped");
            }
        }
    }
}

impl<E: Clock> Automaton for Mailbox<E> {
    type Digest = Digest;
    type Context = Context<Self::Digest>;

    async fn genesis(&mut self) -> Self::Digest {
        let (response, receiver) = oneshot::channel();
        let mut sender = self.sender.clone();
        let mut stopped = self.stopped.clone();
        select! {
            result = sender.send(Message::Genesis { response }) => {
                if result.is_err() {
                    warn!("application mailbox closed; returning genesis digest");
                    return genesis_digest();
                }
            },
            _ = &mut stopped => {
                warn!("application shutting down; returning genesis digest");
                return genesis_digest();
            },
        }
        receiver.await.unwrap_or_else(|_| {
            warn!("application actor dropped genesis response; returning genesis digest");
            genesis_digest()
        })
    }

    async fn propose(&mut self, context: Context<Self::Digest>) -> oneshot::Receiver<Self::Digest> {
        // If we linked payloads to their parent, we would include
        // the parent in the `Context` in the payload.
        let (response, receiver) = oneshot::channel();
        let mut sender = self.sender.clone();
        let mut stopped = self.stopped.clone();
        select! {
            result = sender.send(Message::Propose { view: context.view, parent: context.parent, response }) => {
                if result.is_err() {
                    warn!(view = context.view, "application mailbox closed; proposing parent digest");
                    let (fallback_tx, fallback_rx) = oneshot::channel();
                    let _ = fallback_tx.send(context.parent.1);
                    return fallback_rx;
                }
            },
            _ = &mut stopped => {
                warn!(view = context.view, "application shutting down; proposing parent digest");
                let (fallback_tx, fallback_rx) = oneshot::channel();
                let _ = fallback_tx.send(context.parent.1);
                return fallback_rx;
            }
        }
        receiver
    }

    async fn verify(
        &mut self,
        context: Context<Self::Digest>,
        payload: Self::Digest,
    ) -> oneshot::Receiver<bool> {
        // If we linked payloads to their parent, we would verify
        // the parent included in the payload matches the provided `Context`.
        let (response, receiver) = oneshot::channel();
        let mut sender = self.sender.clone();
        let mut stopped = self.stopped.clone();
        select! {
            result = sender.send(Message::Verify { view: context.view, parent: context.parent, payload, response }) => {
                if result.is_err() {
                    warn!(view = context.view, ?payload, "application mailbox closed; verify returns false");
                    let (fallback_tx, fallback_rx) = oneshot::channel();
                    let _ = fallback_tx.send(false);
                    return fallback_rx;
                }
            },
            _ = &mut stopped => {
                warn!(view = context.view, ?payload, "application shutting down; verify returns false");
                let (fallback_tx, fallback_rx) = oneshot::channel();
                let _ = fallback_tx.send(false);
                return fallback_rx;
            }
        }
        receiver
    }
}

impl<E: Clock> Relay for Mailbox<E> {
    type Digest = Digest;

    async fn broadcast(&mut self, digest: Self::Digest) {
        let mut sender = self.sender.clone();
        let mut stopped = self.stopped.clone();
        select! {
            result = sender.send(Message::Broadcast { payload: digest }) => {
                if result.is_err() {
                    warn!(?digest, "application mailbox closed; broadcast dropped");
                }
            },
            _ = &mut stopped => {
                warn!(?digest, "application shutting down; broadcast dropped");
            }
        }
    }
}

impl<E: Clock> Reporter for Mailbox<E> {
    type Activity = Block;

    async fn report(&mut self, block: Self::Activity) {
        let (response, receiver) = oneshot::channel();
        {
            let mut sender = self.sender.clone();
            let mut stopped = self.stopped.clone();
            select! {
                result = sender.send(Message::Finalized { block, response }) => {
                    if result.is_err() {
                        warn!("application mailbox closed; finalized dropped");
                        return;
                    }
                },
                _ = &mut stopped => {
                    warn!("application shutting down; finalized dropped");
                    return;
                }
            }
        }

        // Wait for the item to be processed (used to increment "save point" in marshal)
        // Note: Result is ignored as the receiver may fail if the system is shutting down
        let mut stopped = self.stopped.clone();
        select! {
            _ = receiver => {},
            _ = &mut stopped => {},
        }
    }
}
