/**
 * Configuration Module Exports
 *
 * Provides clean imports for all configuration modules:
 *
 * import { RESOURCE_CONFIG, isLowResourceMode } from '../config/index.js';
 * // or
 * import { RESOURCE_CONFIG } from '../config/resource-config.js';
 */

export {
    RESOURCE_CONFIG,
    isLowResourceMode,
    isUltraLowResourceMode,
    getScraperChromeArgs,
    getWhatsappChromeArgs,
    getDatabaseConfig,
} from './resource-config.js';
