import * as Joi from 'joi';
import { ConfigHelper } from 'src/utils/configHelper.util';

export const environmentsConfig = () => ({
  PORT: Number(process.env.PORT),
  NODE_ENV: process.env.NODE_ENV,
  BASE_URL: process.env.BASE_URL || `http://localhost:${process.env.PORT}`,
  GLOBAL_PEFIX: process.env.GLOBAL_PEFIX,

  EMAIL: process.env.EMAIL,
  EMAIL_TEST: process.env.EMAIL_TEST,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN,
  REDIRECT_URI: process.env.REDIRECT_URI,

  BBVA_ID_COMERCIO: process.env.BBVA_ID_COMERCIO,
  BBVA_PASS: process.env.BBVA_PASS,
  BBVA_ID_BANCO: Number(process.env.BBVA_ID_BANCO),

  BANCO_POPULAR_ID_BANCO: Number(process.env.BANCO_POPULAR_ID_BANCO),
  BANCO_POPULAR_TOKEN: process.env.BANCO_POPULAR_TOKEN,

  CODIGO_CONVENIO: Number(process.env.CODIGO_CONVENIO),
  TIEMPO_VERIFICACION_MIN: Number(process.env.TIEMPO_VERIFICACION_MIN),

  MYSQL_SGD_HOST: process.env.MYSQL_SGD_HOST,
  MYSQL_SGD_USER: process.env.MYSQL_SGD_USER,
  MYSQL_SGD_PASS: process.env.MYSQL_SGD_PASS,
  MYSQL_SGD_DATABASE: process.env.MYSQL_SGD_DATABASE,
  MYSQL_SGD_PORT: Number(process.env.MYSQL_SGD_PORT),

  MSSQL_SYSAPOLO_USER: process.env.MSSQL_SYSAPOLO_USER,
  MSSQL_SYSAPOLO_PASS: process.env.MSSQL_SYSAPOLO_PASS,
  MSSQL_SYSAPOLO_DATABASE: process.env.MSSQL_SYSAPOLO_DATABASE,
  MSSQL_SYSAPOLO_SERVER: process.env.MSSQL_SYSAPOLO_SERVER,
  MSSQL_SYSAPOLO_PORT: Number(process.env.MSSQL_SYSAPOLO_PORT),
});

export const envValidationSchema = Joi.object({
  PORT: Joi.number().required(),
  NODE_ENV: Joi.required(),
  BASE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required(),
  GLOBAL_PEFIX: Joi.string().required().default('/api/v2'),
  EMAIL_TEST: Joi.string().email().required(),
  EMAIL: Joi.string().email().required(),
  CODIGO_CONVENIO: Joi.number().required().default('7709998885721'),

  MYSQL_SGD_HOST: Joi.string()
    .ip({ version: ['ipv4'] })
    .required(),
  MYSQL_SGD_USER: Joi.string().required(),
  MYSQL_SGD_PASS: Joi.string().required(),
  MYSQL_SGD_DATABASE: Joi.string().required(),
  MYSQL_SGD_PORT: Joi.number().port().required(),

  MSSQL_SYSAPOLO_USER: Joi.string().required(),
  MSSQL_SYSAPOLO_PASS: Joi.string().required(),
  MSSQL_SYSAPOLO_DATABASE: Joi.string().required(),
  MSSQL_SYSAPOLO_SERVER: Joi.string().required(),
  MSSQL_SYSAPOLO_PORT: Joi.number().required().default('1433'),
});

export function getBaseUrl(): string {
  return ConfigHelper.getBaseUrl();
}
