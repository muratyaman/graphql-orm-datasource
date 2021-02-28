import { Connection } from 'typeorm';

export interface CacheOptions {
  milliseconds: number;
};

export interface GraphqlOrmDataSourceConfig {
  orm: Connection;
  cache?: CacheOptions;
}
