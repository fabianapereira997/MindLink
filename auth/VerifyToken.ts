import { Request, Response, NextFunction } from 'express';
const jwt = require('jsonwebtoken');

export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // expects "Bearer <token>"

    if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!);
        (req as any).user = decoded; // { id, tipo }
        next();
    } catch {
        return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
};