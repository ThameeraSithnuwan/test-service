import { Entity, PrimaryGeneratedColumn, Column, PrimaryColumn, BeforeInsert, DeleteDateColumn } from 'typeorm';
import { generatePrefixedUUID } from './utils';

export interface Cluster {
  id: string;
  projectId: string;
  organizationId: string;
  name: string;
  clusterVersion: string;
  agentOperatorVersion: string;
  createdAt: Date;
  updatedAt: Date;
  connected: boolean;
  metadata: { [key: string]: any }
  lastSeen: Date;
  agentConnectTime: Date;
  isOrganizationGlobal: boolean;
  isGlobal: boolean;
  secretStore: string;
  aws?: {
    region: string;
    credentialId: string;
  }
  agent?: {
    cpu: string;
    memory: string;
    replicas: number;
  }
  type: string;
  envs: { id: string, name: string }[];
  description: string;
}



@Entity({ name: 'clusters' })
export class ClusterEntity implements Cluster {

  @PrimaryColumn({
    name: "id",
    unique: true
  })
  id: string;


  @BeforeInsert()
  addPrefixToUUID() {
    this.id = generatePrefixedUUID("cluster_");
  }

  @Column()
  projectId: string;

  @Column()
  organizationId: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  clusterVersion: string;

  @Column({ nullable: true })
  agentOperatorVersion: string;

  @Column({ nullable: true })
  clusterSecretKey: string;

  @Column({ nullable: true })
  clusterJwtKeyRef: string;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @Column({ default: false })
  connected: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: { [key: string]: any };

  @Column({ type: 'timestamp', nullable: true })
  lastSeen: Date;

  @Column({ type: 'timestamp', nullable: true })
  agentConnectTime: Date;

  @Column({ default: false })
  isGlobal: boolean;

  @Column({ default: false })
  isOrganizationGlobal: boolean;

  @Column({ default: 'SHARED', nullable: true })
  secretStore: string;

  @Column({ type: 'jsonb', nullable: true })
  aws?: {
    region: string;
    credentialId: string;
  }

  @Column({ type: 'jsonb', nullable: true })
  agent?: {
    cpu: string;
    memory: string;
    replicas: number;
  }

  @Column({ default: 'OTHER', nullable: true })
  type: string;

  @Column({ type: 'jsonb', nullable: true })
  envs: { id: string, name: string }[];

  @Column({ type: 'text', nullable: true })
  description: string;

  @DeleteDateColumn()
  deletedAt?: Date;
}

