import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:9010');

ws.on('open', () => {
  console.log('Connected to gateway');
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log(`[${new Date().toISOString().slice(11, 23)}] Received:`, msg.type, JSON.stringify(msg).slice(0, 200));
  
  if (msg.type === 'session_ready') {
    // Session is ready with auto-registered player
    console.log('Session ready, starting Hi-Lo...');
    ws.send(JSON.stringify({ type: 'hilo_deal', amount: 100 }));
  } else if (msg.type === 'game_started') {
    console.log('Game started! Cashing out in 500ms...');
    setTimeout(() => {
      console.log('Sending cashout...');
      ws.send(JSON.stringify({ type: 'hilo_cashout' }));
    }, 500);
  } else if (msg.type === 'game_completed' || msg.type === 'game_result') {
    console.log('SUCCESS! Payout:', msg.payout, 'FinalChips:', msg.finalChips);
    ws.close();
    process.exit(0);
  } else if (msg.type === 'game_error' || msg.type === 'error') {
    console.log('ERROR:', msg.errorCode || msg.code, msg.errorMessage || msg.message);
    ws.close();
    process.exit(1);
  } else if (msg.type === 'move_accepted') {
    console.log('Move accepted, waiting for game_result...');
  } else if (msg.type === 'game_move') {
    console.log('Game move received, continuing to wait for completion...');
  }
});

ws.on('error', (err) => console.error('WS Error:', err.message));

setTimeout(() => { console.log('Timeout'); ws.close(); process.exit(1); }, 45000);
