import express, { Request, Response } from 'express';
const app = express();
const port = 4000;

// Mock data (you can customize this based on your requirements)
interface MockData {
    id: number;
    name: string;
}

const secrets = {
    "test-cluster-id": "8e0ff0eb53c38c9c343eb71f0314c72c4b85ba7aff34908d19a0b9b11a9f5383"
}

// Endpoint to get all mock data
app.post('/api/v1/secret/get', (req: Request, res: Response) => {

    res.json({
        "success": true,
        "message": "New Shared Secret Added",
        "data": ""
    });
});

app.post('/api/v1/secret/create', (req: Request, res: Response) => {
    res.json({
        "success": true,
        "message": "New Shared Secret Added",
        "data": "8e0ff0eb53c38c9c343eb71f0314c72c4b85ba7aff34908d19a0b9b11a9f5383"
    });
});


app.listen(port, () => {
    console.log(`Mock server listening at http://localhost:${port}`);
});
