import { Entity, PrimaryGeneratedColumn, Column, PrimaryColumn, BeforeInsert } from 'typeorm';
import { generatePrefixedUUID } from './utils';
import { AgentRequestResponse } from '../../common/interfaces/events';
import { Events } from '../../common/contstants/events';

export interface Cache {
    id?: string;
    projectId: string;
    organizationId: string;
    clusterId: string;
    metadata?: { [key: string]: any }
    error: string;
    lastTried: Date;
    createdAt?: Date;
    kind: string;
    namespace: string;
    name: string;
    resourceId: string;
    agentRequestEncrypted: AgentRequestResponse;
    message?: string;
    status?: string;
    action: string;
    labels?: string[];
}

@Entity({ name: 'cache' })
export class CacheEntity implements Cache {


    @PrimaryColumn({
        name: "id",
        unique: true
    })
    id: string;


    @BeforeInsert()
    addPrefixToUUID() {
        this.id = generatePrefixedUUID("cache_");
    }

    @Column()
    projectId: string;

    @Column()
    organizationId: string;

    @Column({ nullable: true })
    clusterId: string;

    @Column({ nullable: true })
    name: string;
    @Column({ nullable: true })
    error: string;

    @Column({ nullable: true, type: 'timestamp' })
    lastTried: Date;
    @Column({ nullable: true })
    kind: string;
    @Column({ nullable: true })
    namespace: string;
    @Column({ nullable: true })
    resourceId: string;

    @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    createdAt: Date;


    @Column({ type: 'jsonb', nullable: true })
    metadata: { [key: string]: any };

    @Column({ type: 'jsonb', nullable: true })
    agentRequestEncrypted: AgentRequestResponse;

    @Column({ nullable: true })
    message: string;

    @Column({ nullable: true })
    status: string;


    @Column({ default: Events.APPLY_RESOURCE })
    action: string;

    @Column({ type: 'jsonb', nullable: true })
    labels: string[];
}

