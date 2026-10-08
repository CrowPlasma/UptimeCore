const http = require('http');
// create group
const req = http.request({hostname: '127.0.0.1', port: 8080, path: '/api/groups', method: 'POST', headers: {'Content-Type': 'application/json'}}, res => {
  let body = ''; res.on('data', d => body += d);
  res.on('end', () => {
    const g = JSON.parse(body);
    console.log('Group created:', g.id);
    
    // create monitor
    const req2 = http.request({hostname: '127.0.0.1', port: 8080, path: '/api/monitors', method: 'POST', headers: {'Content-Type': 'application/json'}}, res2 => {
      let b2 = ''; res2.on('data', d => b2 += d);
      res2.on('end', () => {
        const m = JSON.parse(b2);
        console.log('Monitor created:', m.id);
        
        // delete monitor
        const req3 = http.request({hostname: '127.0.0.1', port: 8080, path: '/api/monitors/'+m.id, method: 'DELETE'}, res3 => {
          console.log('Monitor deleted', res3.statusCode);
          
          // fetch groups
          const req4 = http.request({hostname: '127.0.0.1', port: 8080, path: '/api/groups', method: 'GET'}, res4 => {
            let b4 = ''; res4.on('data', d => b4 += d);
            res4.on('end', () => {
              const groups = JSON.parse(b4);
              console.log('Groups left:', groups.map(gr => gr.id).join(', '));
            });
          });
          req4.end();
        });
        req3.end();
      });
    });
    req2.write(JSON.stringify({group_id: g.id, name: 'Test Mon', type: 'HTTP', target: 'http://foo'})); req2.end();
  });
});
req.write(JSON.stringify({name: 'Test Group API', description: '', tags: []})); req.end();
