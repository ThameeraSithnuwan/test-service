
import fs from 'fs';
import * as path from 'path';


const yamlFilePath = path.join(__dirname, 'shell-job.yaml');
// Read and parse the config file synchronously
const shellJobYaml: string = fs.readFileSync(yamlFilePath, 'utf-8');

export default shellJobYaml;

