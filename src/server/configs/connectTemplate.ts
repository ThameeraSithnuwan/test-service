
import fs from 'fs';
import * as path from 'path';


const yamlFilePath = path.join(__dirname, 'connect-template.yaml');
// Read and parse the config file synchronously
const connectTemplate: string = fs.readFileSync(yamlFilePath, 'utf-8');

export default connectTemplate;