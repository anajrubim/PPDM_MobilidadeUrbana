import type { Monitor } from './monitor.js';
import type { ServiceAlerts } from './service-alerts.js';

/** Serviços compartilhados pelas rotas da Sprint 2 (criados uma vez por app). */
export interface Services {
  alerts: ServiceAlerts;
  monitor: Monitor;
}
