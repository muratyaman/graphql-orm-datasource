import { Connection } from 'typeorm';

export interface CacheOptions {
  milliseconds: number;
  seconds: number;
};

export interface GraphqlOrmDataSourceConfig {
  orm: Connection;
  cache?: CacheOptions;
}
