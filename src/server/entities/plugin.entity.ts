import { Entity, PrimaryGeneratedColumn, Column, PrimaryColumn, BeforeInsert } from 'typeorm';
import { generatePrefixedUUID } from './utils';
import { AgentRequestResponse } from '../../common/interfaces/events';

export interface ClusterPlugin {
    id: string;
    projectId: string;
    organizationId: string;
    clusterId: string;
    metadata: { [key: string]: string }
    pluginName: string;
    pluginType: string;
    createdAt?: Date;
    updatedAt?: Date;
    url?: string;
    enabled?: boolean;
}

@Entity({ name: 'plugins' })
export class ClusterPluginEntity implements ClusterPlugin {


    @PrimaryColumn({
        name: "id",
        unique: true
    })
    id: string;

    @BeforeInsert()
    addPrefixToUUID() {
        this.id = generatePrefixedUUID("clusterplugin_");
    }

    @Column()
    projectId: string;

    @Column()
    organizationId: string;

    @Column()
    clusterId: string;

    @Column({ type: 'jsonb', nullable: true })
    metadata: { [key: string]: string };

    @Column()
    pluginName: string;

    @Column()
    pluginType: string;

    @Column({ nullable: true })
    url?: string;

    @Column({ nullable: true })
    enabled?: boolean;

    @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    createdAt?: Date;

    @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    updatedAt?: Date;


}


