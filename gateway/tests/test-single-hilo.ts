import WebSocket from 'ws';

const GATEWAY_URL = 'ws://localhost:9010';

async function testHiLo() {
  const ws = new WebSocket(GATEWAY_URL);

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log('Response:', msg.type, JSON.stringify(msg).slice(0, 150));
  });
  ws.on('error', (err) => console.error('Error:', err));

  // Wait for session_ready
  await new Promise<void>((resolve) => {
    const handler = (data: WebSocket.Data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'session_ready') {
        ws.off('message', handler);
        resolve();
      }
    };
    ws.on('message', handler);
  });

  // Wait for registration
  for (let i = 0; i < 10; i++) {
    const balance = await new Promise<Record<string, unknown>>((resolve) => {
      const handler = (data: WebSocket.Data) => {
        ws.off('message', handler);
        resolve(JSON.parse(data.toString()));
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ type: 'get_balance' }));
    });
    if (balance.registered && balance.hasBalance) {
      console.log('Registered!');
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('Sending hilo_deal...');
  ws.send(JSON.stringify({ type: 'hilo_deal', amount: 100 }));

  // Wait 15s for response
  await new Promise(r => setTimeout(r, 15000));

  ws.close();
  process.exit(0);
}

testHiLo();
