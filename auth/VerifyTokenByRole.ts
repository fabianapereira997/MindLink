import { Request, Response, NextFunction } from 'express';

export const verifyTokenByRole = (...roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = (req as any).user;

        if (!user) {
            return res.status(401).json({ error: 'Não autenticado' });
        }

        if (!roles.includes(user.tipo)) {
            return res.status(403).json({ error: 'Acesso negado: não tem permissão para este recurso' });
        }

        next();
    };
};
