import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ServeStaticModule } from '@nestjs/serve-static';
import { join, resolve } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { environmentsConfig, envValidationSchema } from './config/environments';
import { InvoiceModule } from './modules/invoice/invoice.module';
import { TasksService } from './services/tasks.service';
import { EmailModule } from './modules/email/email.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [environmentsConfig],
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // name: EConnection.SIGEIN,
        type: 'mysql',
        host: config.get<string>('MYSQL_SGD_HOST'),
        username: config.get<string>('MYSQL_SGD_USER'),
        password: config.get<string>('MYSQL_SGD_PASS'),
        database: config.get<string>('MYSQL_SGD_DATABASE'),
        port: Number(config.get<number>('MYSQL_SGD_PORT')),
        entities: [
          resolve(__dirname, 'modules/invoice/entities/*.entity{.ts,.js}'),
        ],
        autoLoadEntities: true,
        synchronize: false,
        logging: 'all',
        retryAttempts: 30,
        insecureAuth: true,
      }),
    }),
    ServeStaticModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          rootPath: join(__dirname, 'assets'),
          serveRoot: `${config.get<string>('GLOBAL_PEFIX')}/assets/`,
        },
      ],
    }),

    ScheduleModule.forRoot(),
    InvoiceModule,
    EmailModule,
  ],
  controllers: [AppController],
  exports: [],
  providers: [AppService, TasksService],
})
export class AppModule {}
