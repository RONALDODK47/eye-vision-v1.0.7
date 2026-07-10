import { createContext } from 'react';

/** Contexto isolado — sobrevive ao HMR do AuthProvider sem quebrar useAuth. */
export const AuthContext = createContext(null);
