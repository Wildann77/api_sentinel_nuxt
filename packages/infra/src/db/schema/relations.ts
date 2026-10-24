import { relations } from "drizzle-orm";
import { checkResults } from "./check_results.js";
import { incidents } from "./incidents.js";
import { monitorMetricsHourly } from "./monitor_metrics_hourly.js";
import { monitors } from "./monitors.js";
import { notificationDeliveries } from "./notification_deliveries.js";
import { sessions } from "./sessions.js";
import { users } from "./users.js";

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const monitorsRelations = relations(monitors, ({ one, many }) => ({
  incidents: many(incidents, { relationName: "monitor_incidents" }),
  currentIncident: one(incidents, {
    fields: [monitors.currentIncidentId],
    references: [incidents.id],
    relationName: "current_incident",
  }),
  checkResults: many(checkResults),
  metricsHourly: many(monitorMetricsHourly),
}));

export const incidentsRelations = relations(incidents, ({ one, many }) => ({
  monitor: one(monitors, {
    fields: [incidents.monitorId],
    references: [monitors.id],
    relationName: "monitor_incidents",
  }),
  checkResults: many(checkResults),
  notificationDeliveries: many(notificationDeliveries),
}));

export const checkResultsRelations = relations(checkResults, ({ one }) => ({
  monitor: one(monitors, {
    fields: [checkResults.monitorId],
    references: [monitors.id],
  }),
  incident: one(incidents, {
    fields: [checkResults.incidentId],
    references: [incidents.id],
  }),
}));

export const notificationDeliveriesRelations = relations(notificationDeliveries, ({ one }) => ({
  incident: one(incidents, {
    fields: [notificationDeliveries.incidentId],
    references: [incidents.id],
  }),
}));

export const monitorMetricsHourlyRelations = relations(monitorMetricsHourly, ({ one }) => ({
  monitor: one(monitors, {
    fields: [monitorMetricsHourly.monitorId],
    references: [monitors.id],
  }),
}));
