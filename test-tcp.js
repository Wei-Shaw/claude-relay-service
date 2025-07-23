const net = require('net');

async function testTcpConnection() {
  console.log('🔍 Testing TCP connection to Redis server...');
  
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const timeout = 30000; // 30秒超时
    
    // 设置超时
    socket.setTimeout(timeout);
    
    socket.on('connect', () => {
      console.log('✅ TCP connection established!');
      
      // 发送 Redis AUTH 命令
      console.log('⏳ Sending AUTH command...');
      socket.write('AUTH plugins_world168\r\n');
    });
    
    socket.on('data', (data) => {
      const response = data.toString().trim();
      console.log('📨 Received response:', response);
      
      if (response === '+OK') {
        console.log('✅ Authentication successful!');
        
        // 发送 PING 命令
        console.log('⏳ Sending PING command...');
        socket.write('PING\r\n');
      } else if (response === '+PONG') {
        console.log('✅ PING successful! Redis is working.');
        socket.end();
        resolve(true);
      } else if (response.startsWith('-ERR')) {
        console.error('❌ Redis error:', response);
        socket.end();
        reject(new Error(response));
      }
    });
    
    socket.on('error', (err) => {
      console.error('❌ Socket error:', err.message);
      console.error('Error code:', err.code);
      reject(err);
    });
    
    socket.on('timeout', () => {
      console.error('❌ Connection timeout');
      socket.destroy();
      reject(new Error('Connection timeout'));
    });
    
    socket.on('close', () => {
      console.log('🔒 Socket closed');
    });
    
    console.log('⏳ Connecting to 45.155.220.206:6379...');
    socket.connect(6379, '45.155.220.206');
  });
}

async function main() {
  try {
    await testTcpConnection();
    console.log('🎉 All tests passed!');
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    
    console.log('\n🔍 Possible issues:');
    console.log('1. Redis server is not accepting external connections');
    console.log('2. Firewall blocking port 6379');
    console.log('3. Redis bind configuration only allows localhost');
    console.log('4. Network routing issues');
    console.log('\n📋 To fix on server:');
    console.log('   - Check Redis config: /etc/redis/redis.conf');
    console.log('   - Look for "bind 127.0.0.1" and change to "bind 0.0.0.0"');
    console.log('   - Check firewall: ufw status / iptables -L');
    console.log('   - Restart Redis: systemctl restart redis');
  }
}

main();