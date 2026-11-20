import { loadDotEnv } from '../config/dotenv.js';

// Lets TEST_DATABASE_URL come from .env so `npm test` runs the database
// tests locally without exporting anything. CI sets it explicitly.
loadDotEnv();
