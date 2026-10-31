import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchMe, getToken, setSessionLostHandler, signIn, signOut } from './api';

const MOCK = import.meta.env.VITE_DATA_SOURCE === 'mock';
const MOCK_USER = { id: 0, email: 'mock data', username: 'mock', role: 'admin' };

export const roleLabel = (role) => ({ admin: 'Admin', staff: 'Employee' }[role] || role);

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(MOCK ? MOCK_USER : null);
    const [checking, setChecking] = useState(!MOCK && !!getToken());
    const [notice, setNotice] = useState('');

    useEffect(() => {
        setSessionLostHandler(() => {
            setUser(null);
            setNotice('Your session has ended. Please sign in again.');
        });
        if (!checking) return undefined;
        let live = true;
        fetchMe()
            .then((u) => live && setUser(u))
            .catch((e) => { if (e.status === 401) signOut(); })
            .finally(() => live && setChecking(false));
        return () => { live = false; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const login = useCallback(async (loginId, password, role) => {
        const u = await signIn(loginId, password, role);
        setNotice('');
        setUser(u);
        return u;
    }, []);

    const logout = useCallback(() => {
        signOut();
        setNotice('');
        setUser(null);
    }, []);

    const value = useMemo(
        () => ({ user, checking, notice, login, logout, isAdmin: user?.role === 'admin' }),
        [user, checking, notice, login, logout]
    );
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}