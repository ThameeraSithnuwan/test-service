import { DataSource } from "typeorm"
import configData from "./config"
import fs from 'fs';
import logger from "../../common/services/loggerService";

// const pemFile = '/Users/nilesh93/Projects/skyu/ssh/skyu-rds-bastian-server_np.pem'
const pemFile = './global-bundle.pem';
let certFile
let ssl

try {
    certFile = fs.readFileSync(pemFile, 'utf-8')?.toString();
    ssl = { ca: certFile }
} catch (err) {
    logger.error("Error reading pem file", err)
}

export const AppDataSource = new DataSource({
    type: "postgres",
    host: configData.postgres.host,
    port: configData.postgres.port,
    username: configData.postgres.username,
    password: configData.postgres.password,
    database: configData.postgres.database,
    logging: ["error"],
    synchronize: true,
    name: 'default',
    ssl: ssl,
    extra: {
        ssl: {
            // Disregard mismatch between localhost and rds.amazonaws.com
            rejectUnauthorized: false
        }
    },
    entities: ['./**/**.entity{.ts,.js}']
})

