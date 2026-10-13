import 'dotenv/config';

import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import cookieParser from 'cookie-parser';
import type { Server, ServerOptions } from 'socket.io';

import { AppModule } from './app.module';

const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

/** Socket.IO adapter that allows the Next.js origin to send cookies. */
class CorsIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: ServerOptions): Server {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: frontendUrl, credentials: true },
    }) as Server;
  }
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // URI versioning: every route lives under /api/v1/...
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.use(cookieParser());
  app.enableCors({ origin: frontendUrl, credentials: true });
  app.useWebSocketAdapter(new CorsIoAdapter(app));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  console.log(`API running at http://localhost:${port}/api/v1`);
}

void bootstrap();
