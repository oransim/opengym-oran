import net from 'node:net';

// A real, local SMTP endpoint. No external mailbox or account credentials are used in tests.
export async function smtpReceiver(t) {
  const mail = [];
  const control = { rejectMessages: false, beforeAccept: null };
  const sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    socket.write('220 localhost test mail\r\n');
    let buffer = '', data = false, message = '', envelope = [];
    socket.on('data', chunk => {
      buffer += chunk;
      while (buffer.includes('\r\n')) {
        const end = buffer.indexOf('\r\n'), line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (data) {
          if (line === '.') {
            const received = { message, envelope }; data = false; message = '';
            Promise.resolve(control.beforeAccept?.()).then(() => {
              if (control.rejectMessages) socket.write('550 message rejected\r\n');
              else { mail.push(received); socket.write('250 accepted\r\n'); }
            });
          }
          else message += line + '\r\n';
        } else if (/^EHLO|^HELO/.test(line)) socket.write('250 localhost\r\n');
        else if (/^MAIL FROM/.test(line)) { envelope = [line]; socket.write('250 OK\r\n'); }
        else if (/^RCPT TO/.test(line)) { envelope.push(line); socket.write('250 OK\r\n'); }
        else if (line === 'DATA') { data = true; socket.write('354 send message\r\n'); }
        else if (line === 'QUIT') socket.end('221 bye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
    socket.on('error', () => {});
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { for (const s of sockets) s.destroy(); server.close(); });
  return { mail, server, control, env: { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(server.address().port), SMTP_FROM: 'tracker@example.com', ORIGIN: 'http://localhost:8080' } };
}
export const tokenIn = mail => {
  const text = mail.message.replace(/=\r?\n/g, '').replace(/=3D/g, '=');
  return text.match(/reset-password\?token=([A-Za-z0-9_-]{43})/)?.[1];
};
export async function waitFor(check) {
  const end = Date.now() + 2000;
  while (!check()) {
    if (Date.now() > end) throw new Error('Timed out waiting for local mail processing');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}
