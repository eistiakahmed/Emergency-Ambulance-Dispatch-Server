import { app } from './app.js';
import { verifyEmailTransporter } from './config/email.js';
import { env } from './config/env.js';
import { connectPrisma, prisma } from './config/prisma.js';
import { redisClient } from './config/redis.js';

async function bootstrap() {
  await connectPrisma();
  await verifyEmailTransporter();

  const server = app.listen(env.PORT, () => {
    console.log(`🚑 =======================================================`);
    console.log(`🚑 Emergency Ambulance Dispatch System REST API Started`);
    console.log(`🚑 Environment: ${env.NODE_ENV}`);
    console.log(`🚑 Server listening on: http://localhost:${env.PORT}`);
    console.log(`🚑 Base API endpoint:  http://localhost:${env.PORT}${env.API_PREFIX}`);
    console.log(`🚑 Interactive Docs:   http://localhost:${env.PORT}${env.API_PREFIX}/docs`);
    console.log(`🚑 =======================================================`);
  });

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
    server.close(async () => {
      console.log('💤 Closed HTTP server connections.');
      try {
        await prisma.$disconnect();
        console.log('🔌 Disconnected Prisma PostgreSQL client.');
        if (redisClient) {
          await redisClient.quit();
          console.log('🔌 Disconnected Redis client.');
        }
      } catch (err) {
        console.error('Error during shutdown cleanup:', err);
      } finally {
        process.exit(0);
      }
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('❌ Fatal bootstrap failure:', err);
  process.exit(1);
});
