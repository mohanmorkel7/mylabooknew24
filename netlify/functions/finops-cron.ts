import type { Handler } from "@netlify/functions";
import finopsAlertService from "../../server/services/finopsAlertService";
import { initializeDatabase } from "../../server/database/connection";

export const handler: Handler = async () => {
  try {
    await initializeDatabase().catch(() => {});
    await finopsAlertService.checkDailyTaskExecution();
    await finopsAlertService.checkSLAAlerts();
    if ((finopsAlertService as any).checkIncompleteSubtasks) {
      await (finopsAlertService as any).checkIncompleteSubtasks();
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e?.message || String(e) }),
    };
  }
};
