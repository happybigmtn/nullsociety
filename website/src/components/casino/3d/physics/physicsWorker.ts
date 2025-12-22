/// <reference lib="webworker" />
import type RAPIER from '@dimforge/rapier3d-compat';

// ============ Message Types ============

export interface PhysicsConfig {
  gravity?: [number, number, number];
  timeStep?: number;
  numSolverIterations?: number;
  maxCcdSubsteps?: number;
}

export interface BodyConfig {
  handle: number;
  type: 'dynamic' | 'kinematic' | 'fixed';
  position: [number, number, number];
  rotation?: [number, number, number, number]; // quaternion
  linearVelocity?: [number, number, number];
  angularVelocity?: [number, number, number];
  mass?: number;
  restitution?: number;
  friction?: number;
  linearDamping?: number;
  angularDamping?: number;
}

export interface ColliderConfig {
  bodyHandle: number;
  shape: 'ball' | 'cuboid' | 'capsule' | 'cylinder';
  params: number[]; // ball: [radius], cuboid: [hx, hy, hz], etc.
  restitution?: number;
  friction?: number;
  density?: number;
}

export interface BodyTransform {
  handle: number;
  position: [number, number, number];
  rotation: [number, number, number, number]; // quaternion (x, y, z, w)
  linearVelocity: [number, number, number];
  angularVelocity: [number, number, number];
}

export type PhysicsWorkerRequest =
  | { type: 'ping'; id?: string }
  | { type: 'init'; id: string; config: PhysicsConfig }
  | { type: 'step'; id: string }
  | { type: 'applyForce'; id: string; bodyHandle: number; impulse: [number, number, number] }
  | { type: 'addBody'; id: string; body: BodyConfig }
  | { type: 'addCollider'; id: string; collider: ColliderConfig }
  | { type: 'removeBody'; id: string; bodyHandle: number };

export type PhysicsWorkerResponse =
  | { type: 'pong'; id?: string; ts: number }
  | { type: 'initResult'; id: string; ok: boolean; error?: string }
  | { type: 'stepResult'; id: string; ok: boolean; transforms: BodyTransform[] }
  | { type: 'applyForceResult'; id: string; ok: boolean }
  | { type: 'addBodyResult'; id: string; ok: boolean; bodyHandle?: number }
  | { type: 'addColliderResult'; id: string; ok: boolean }
  | { type: 'removeBodyResult'; id: string; ok: boolean };

// ============ Physics State ============

let RAPIER_MODULE: typeof RAPIER | null = null;
let world: RAPIER.World | null = null;
let bodyHandles = new Map<number, RAPIER.RigidBody>();
let nextBodyHandle = 1;

// ============ Initialization ============

async function initializeWorld(config: PhysicsConfig): Promise<void> {
  if (!RAPIER_MODULE) {
    // Dynamic import of Rapier module
    RAPIER_MODULE = await import('@dimforge/rapier3d-compat');
    await RAPIER_MODULE.init();
  }

  const gravity = config.gravity ?? [0, -9.81, 0];
  world = new RAPIER_MODULE.World(new RAPIER_MODULE.Vector3(...gravity));

  if (config.numSolverIterations !== undefined) {
    world.numSolverIterations = config.numSolverIterations;
  }
  if (config.maxCcdSubsteps !== undefined) {
    world.maxCcdSubsteps = config.maxCcdSubsteps;
  }
}

// ============ Body Management ============

function createBody(bodyConfig: BodyConfig): number {
  if (!world || !RAPIER_MODULE) throw new Error('World not initialized');

  let rigidBodyDesc: RAPIER.RigidBodyDesc;
  switch (bodyConfig.type) {
    case 'dynamic':
      rigidBodyDesc = RAPIER_MODULE.RigidBodyDesc.dynamic();
      break;
    case 'kinematic':
      rigidBodyDesc = RAPIER_MODULE.RigidBodyDesc.kinematicPositionBased();
      break;
    case 'fixed':
      rigidBodyDesc = RAPIER_MODULE.RigidBodyDesc.fixed();
      break;
  }

  rigidBodyDesc.setTranslation(...bodyConfig.position);

  if (bodyConfig.rotation) {
    rigidBodyDesc.setRotation({
      x: bodyConfig.rotation[0],
      y: bodyConfig.rotation[1],
      z: bodyConfig.rotation[2],
      w: bodyConfig.rotation[3],
    });
  }

  if (bodyConfig.linearDamping !== undefined) {
    rigidBodyDesc.setLinearDamping(bodyConfig.linearDamping);
  }

  if (bodyConfig.angularDamping !== undefined) {
    rigidBodyDesc.setAngularDamping(bodyConfig.angularDamping);
  }

  const rigidBody = world.createRigidBody(rigidBodyDesc);

  if (bodyConfig.linearVelocity) {
    rigidBody.setLinvel(new RAPIER_MODULE.Vector3(...bodyConfig.linearVelocity), true);
  }

  if (bodyConfig.angularVelocity) {
    rigidBody.setAngvel(new RAPIER_MODULE.Vector3(...bodyConfig.angularVelocity), true);
  }

  const handle = bodyConfig.handle ?? nextBodyHandle++;
  bodyHandles.set(handle, rigidBody);

  return handle;
}

function createCollider(colliderConfig: ColliderConfig): void {
  if (!world || !RAPIER_MODULE) throw new Error('World not initialized');

  const body = bodyHandles.get(colliderConfig.bodyHandle);
  if (!body) throw new Error(`Body with handle ${colliderConfig.bodyHandle} not found`);

  let colliderDesc: RAPIER.ColliderDesc;
  const { shape, params } = colliderConfig;

  switch (shape) {
    case 'ball':
      colliderDesc = RAPIER_MODULE.ColliderDesc.ball(params[0]);
      break;
    case 'cuboid':
      colliderDesc = RAPIER_MODULE.ColliderDesc.cuboid(params[0], params[1], params[2]);
      break;
    case 'capsule':
      colliderDesc = RAPIER_MODULE.ColliderDesc.capsule(params[0], params[1]);
      break;
    case 'cylinder':
      colliderDesc = RAPIER_MODULE.ColliderDesc.cylinder(params[0], params[1]);
      break;
    default:
      throw new Error(`Unknown collider shape: ${shape}`);
  }

  if (colliderConfig.restitution !== undefined) {
    colliderDesc.setRestitution(colliderConfig.restitution);
  }

  if (colliderConfig.friction !== undefined) {
    colliderDesc.setFriction(colliderConfig.friction);
  }

  if (colliderConfig.density !== undefined) {
    colliderDesc.setDensity(colliderConfig.density);
  }

  world.createCollider(colliderDesc, body);
}

function removeBody(handle: number): void {
  if (!world) throw new Error('World not initialized');

  const body = bodyHandles.get(handle);
  if (!body) throw new Error(`Body with handle ${handle} not found`);

  world.removeRigidBody(body);
  bodyHandles.delete(handle);
}

function applyImpulse(handle: number, impulse: [number, number, number]): void {
  if (!RAPIER_MODULE) throw new Error('World not initialized');

  const body = bodyHandles.get(handle);
  if (!body) throw new Error(`Body with handle ${handle} not found`);

  body.applyImpulse(new RAPIER_MODULE.Vector3(...impulse), true);
}

// ============ Simulation ============

function stepSimulation(): BodyTransform[] {
  if (!world) throw new Error('World not initialized');

  world.step();

  const transforms: BodyTransform[] = [];
  for (const [handle, body] of Array.from(bodyHandles.entries())) {
    const translation = body.translation();
    const rotation = body.rotation();
    const linvel = body.linvel();
    const angvel = body.angvel();

    transforms.push({
      handle,
      position: [translation.x, translation.y, translation.z],
      rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
      linearVelocity: [linvel.x, linvel.y, linvel.z],
      angularVelocity: [angvel.x, angvel.y, angvel.z],
    });
  }

  return transforms;
}

// ============ Message Handler ============

self.addEventListener('message', async (event: MessageEvent<PhysicsWorkerRequest>) => {
  const message = event.data;
  if (!message || typeof message !== 'object') return;

  try {
    switch (message.type) {
      case 'ping': {
        const response: PhysicsWorkerResponse = {
          type: 'pong',
          id: message.id,
          ts: performance.now(),
        };
        self.postMessage(response);
        break;
      }

      case 'init': {
        await initializeWorld(message.config);
        const response: PhysicsWorkerResponse = {
          type: 'initResult',
          id: message.id,
          ok: true,
        };
        self.postMessage(response);
        break;
      }

      case 'step': {
        const transforms = stepSimulation();
        const response: PhysicsWorkerResponse = {
          type: 'stepResult',
          id: message.id,
          ok: true,
          transforms,
        };
        self.postMessage(response);
        break;
      }

      case 'applyForce': {
        applyImpulse(message.bodyHandle, message.impulse);
        const response: PhysicsWorkerResponse = {
          type: 'applyForceResult',
          id: message.id,
          ok: true,
        };
        self.postMessage(response);
        break;
      }

      case 'addBody': {
        const handle = createBody(message.body);
        const response: PhysicsWorkerResponse = {
          type: 'addBodyResult',
          id: message.id,
          ok: true,
          bodyHandle: handle,
        };
        self.postMessage(response);
        break;
      }

      case 'addCollider': {
        createCollider(message.collider);
        const response: PhysicsWorkerResponse = {
          type: 'addColliderResult',
          id: message.id,
          ok: true,
        };
        self.postMessage(response);
        break;
      }

      case 'removeBody': {
        removeBody(message.bodyHandle);
        const response: PhysicsWorkerResponse = {
          type: 'removeBodyResult',
          id: message.id,
          ok: true,
        };
        self.postMessage(response);
        break;
      }
    }
  } catch (error) {
    // Send error response for any failed operation
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[PhysicsWorker] Error:', errorMessage);

    // Send appropriate error response based on message type
    if (message.type === 'init') {
      self.postMessage({
        type: 'initResult',
        id: message.id,
        ok: false,
        error: errorMessage,
      } as PhysicsWorkerResponse);
    }
  }
});
