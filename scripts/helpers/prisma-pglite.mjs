import net from 'node:net';
import {PGlite} from '@electric-sql/pglite';
import {PrismaClient} from '../../backend/node_modules/@prisma/client/default.js';
// One local wire connection lets regressions exercise the actual Prisma client
// and PostgreSQL triggers together, rather than replacing either with mocks.
const packet=(kind,data)=>{const size=Buffer.alloc(4);size.writeInt32BE(data.length+4);return Buffer.concat([Buffer.from(kind),size,data]);};
const int=value=>{const b=Buffer.alloc(4);b.writeInt32BE(value);return b;};
const status=(key,value)=>packet('S',Buffer.from(key+'\0'+value+'\0'));
export async function prismaPGlite(){
 const pg=new PGlite();await pg.waitReady;let queue=Promise.resolve();const sockets=new Set();
 const server=net.createServer(socket=>{sockets.add(socket);let startup=true,buffer=Buffer.alloc(0);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
  socket.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);for(;;){
   if(startup){if(buffer.length<4)return;const length=buffer.readInt32BE();if(buffer.length<length)return;const message=buffer.subarray(0,length);buffer=buffer.subarray(length);const code=message.readInt32BE(4);
    if(code===80877103||code===80877104){socket.write('N');continue;}
    if(code!==196608){socket.destroy();return;}startup=false;
    socket.write(Buffer.concat([packet('R',int(0)),status('server_version','17.5'),status('client_encoding','UTF8'),status('DateStyle','ISO, MDY'),status('integer_datetimes','on'),status('standard_conforming_strings','on'),packet('K',Buffer.concat([int(1),int(1)])),packet('Z',Buffer.from('I'))]));continue;
   }
   if(buffer.length<5)return;const length=buffer.readInt32BE(1)+1;if(buffer.length<length)return;const message=buffer.subarray(0,length);buffer=buffer.subarray(length);if(message[0]===88){socket.end();return;}
   queue=queue.then(async()=>{const output=await pg.execProtocolRaw(message);if(output.length&&!socket.destroyed)socket.write(Buffer.from(output));}).catch(error=>{socket.destroy(error);});
  }});
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=server.address().port,url=`postgresql://postgres:local@127.0.0.1:${port}/postgres?sslmode=disable&connection_limit=1&connect_timeout=5`;
 const db=new PrismaClient({datasources:{db:{url}}});
 return {db,pg,url,close:async()=>{await db.$disconnect();for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));await queue;await pg.close();}};
}
