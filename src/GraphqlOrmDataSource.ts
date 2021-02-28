import { EJSON } from 'bson';
import { DataSource, DataSourceConfig } from 'apollo-datasource';
import { InMemoryLRUCache, KeyValueCache } from 'apollo-server-caching';
import { Connection, EntityManager, EntityTarget, FindManyOptions, FindOneOptions, RemoveOptions, Repository, SaveOptions } from 'typeorm';
import { GraphqlOrmDataSourceConfig } from './types';

export class GraphqlOrmDataSource<TContext = any> extends DataSource<TContext> {

  context?: TContext;

  cache?: KeyValueCache;

  orm: Connection;
  useCache: boolean;
  cacheTtl: number;

  constructor(ormConfig: GraphqlOrmDataSourceConfig) {
    super();
    this.orm = ormConfig.orm;
    this.useCache = !! ormConfig.cache;
    this.cacheTtl = ormConfig.cache?.milliseconds ?? 1000 * 30;
  }

  initialize(config: DataSourceConfig<TContext>): void {
    // copy context
    this.context = config.context;

    // copy cache or create new one
    if (this.useCache) {
      this.cache = config.cache || new InMemoryLRUCache();
    }
  }

  em(): EntityManager {
    return this.orm.manager;
  }

  repo<TEntity>(target: EntityTarget<TEntity>): Repository<TEntity> {
    return this.orm.getRepository<TEntity>(target);
  }

  protected getEntityCacheKey(repoName: string, id: any, options: any = {}) {
    return EJSON.stringify({ repoName, id, options });
  }

  protected async cacheGet<T>(key: string): Promise<T | undefined> {
    if (this.cache) {
      const cachedData = await this.cache.get(key);
      if (cachedData) {
        const parsed = EJSON.parse(cachedData);
        if (parsed) {
          return Promise.resolve(parsed as T);
        }
        // else parse error!
      }
      // else: cache miss!
    }
    return Promise.resolve(undefined);
  }

  protected cacheSet(key: string, val: any): void {
    if (this.cache) {
      const cacheStr = EJSON.stringify(val); 
      this.cache.set(key, cacheStr, { ttl: this.cacheTtl });
    }
  }

  async findOne<TEntity>(
    target: EntityTarget<TEntity>,
    id: any,
    options: FindOneOptions<TEntity> = {},
  ): Promise<TEntity | undefined> {
    const repo = this.repo<TEntity>(target);
    const repoName = typeof repo;
    const key = this.getEntityCacheKey(repoName, id, options);
    let data: TEntity | undefined = await this.cacheGet<TEntity>(key);
    if (!data) { // cache miss
      data = await repo.findOne(id, options);
      if (data) this.cacheSet(key, data); // silently cache for later
    }
    return Promise.resolve(data);
  }

  async findManyByIds<TEntity>(
    target: EntityTarget<TEntity>,
    ids: any[],
    options: FindManyOptions<TEntity> = {},
  ): Promise<Array<TEntity | undefined>> {
    const repo = this.repo<TEntity>(target);
    const repoName = typeof repo;
    let data: Array<TEntity | undefined> = [];
    
    if (this.cache) {
      let key: string;
      const idsNotFound: any[] = [];
      let row: TEntity | undefined;
      for (let id of ids) {
        // we are not using 'options' while fetching 1-by-1
        key = this.getEntityCacheKey(repoName, id);
        row = await this.cacheGet<TEntity>(key);
        if (row) {
          data.push(row);
        } else {
          idsNotFound.push(id);
        }
      }
      for (let id of idsNotFound) {
        row = await this.findOne(target, id);
        data.push(row);
      }
    } else {
      const rows = await repo.findByIds(ids, options);
      data = rows;
    }
    
    return Promise.resolve(data);
  }

  async saveOne<TEntity>(entity: TEntity, options?: SaveOptions): Promise<TEntity> {
    return this.orm.manager.save(entity, options);
  }

  async removeOne<TEntity>(entity: TEntity, options?: RemoveOptions): Promise<TEntity> {
    return this.orm.manager.remove(entity, options);
  }
}
