/**
 * Authentication Context
 * Provides auth state to the app and guards protected routes
 */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { getBoolean, setBoolean, deleteKey, STORAGE_KEYS, initializeStorage } from '../services/storage';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  authenticate: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user was previously authenticated this session
  useEffect(() => {
    let mounted = true;
    const checkAuth = async () => {
      try {
        await initializeStorage();
        // Check for existing session (could also verify biometrics haven't expired)
        const hasSession = getBoolean(STORAGE_KEYS.SESSION_ACTIVE, false);
        if (mounted) {
          setIsAuthenticated(hasSession);
        }
      } catch {
        if (mounted) {
          setIsAuthenticated(false);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };
    void checkAuth();
    return () => {
      mounted = false;
    };
  }, []);

  const authenticate = useCallback(() => {
    setIsAuthenticated(true);
    void (async () => {
      try {
        await initializeStorage();
        setBoolean(STORAGE_KEYS.SESSION_ACTIVE, true);
      } catch (error) {
        console.warn('[auth] Failed to persist session:', error);
      }
    })();
  }, []);

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    void (async () => {
      try {
        await initializeStorage();
        deleteKey(STORAGE_KEYS.SESSION_ACTIVE);
      } catch (error) {
        console.warn('[auth] Failed to clear session:', error);
      }
    })();
  }, []);

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, isLoading, authenticate, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
