import { AppDataSource } from "../configs/ormconfig"
import { CacheEntity, Cache } from "../entities/cache.entity"
import { AgentService } from "./agentService";
import { REDIS_SUBSCRIPTION_TIMEOUT } from "./redisService";

class CacheService {
    public static async upsert(obj: Cache) {

        const clusterRepository = AppDataSource.getRepository(CacheEntity)

        const cacheEntity = Object.assign(new CacheEntity(), obj);

        const cacheInstance = await clusterRepository.findOneBy({
            projectId: cacheEntity.projectId,
            organizationId: cacheEntity.organizationId,
            clusterId: cacheEntity.clusterId,
            resourceId: cacheEntity.resourceId,
            namespace: cacheEntity.namespace,
            name: cacheEntity.name,
            kind: cacheEntity.kind
        })
        if (!cacheInstance) {
            clusterRepository.save(cacheEntity)
        } else {
            clusterRepository.update(cacheInstance.id, cacheEntity)
        }

    }
}

export async function SyncClusterCache(projectId: string, organizationId: string, clusterId: string, traceId: string) {
    console.log("sync cluster cache started for clusterId: ", clusterId, "projectId: ", projectId, "organizationId: ", organizationId, "traceId:", traceId)
    const cacheRepository = AppDataSource.getRepository(CacheEntity)
    const cacheItems = await cacheRepository.find({
        where: [{
            projectId: projectId,
            organizationId: organizationId,
            status: 'error',
            clusterId: clusterId
        }]
    })

    if (!cacheItems) {
        console.log("no cache items found for clusterId: ", clusterId, "projectId: ", projectId, "organizationId: ", organizationId, "traceId:", traceId)
        return
    }

    for (const cacheItem of cacheItems) {
        try {
            const res = await AgentService.communicateWithCluster(cacheItem.agentRequestEncrypted, traceId as string, REDIS_SUBSCRIPTION_TIMEOUT, true);
            cacheRepository.update(cacheItem.id, { status: 'synced' })
        } catch (error) {
            cacheRepository.update(cacheItem.id, { status: 'error', error: error as string || 'Error communicating with cluster', lastTried: new Date() })
            console.log("Error in retryAll: ", error, clusterId, "projectId: ", projectId, "organizationId: ", organizationId, "traceId:", traceId, JSON.stringify(cacheItem.agentRequestEncrypted, null, 2))
        }
    }
    console.log("sync cluster cache completed for clusterId: ", clusterId, "projectId: ", projectId, "organizationId: ", organizationId, "traceId:", traceId)
}


export default CacheService 
