/** Het automatische planvoorstel is alleen voor de eigenaar: iedereen anders ziet er niets van. */
export const AUTO_PLAN_EMAIL = "jaapankersmid@gmail.com";

export const canAutoPlan = (email: string | null | undefined) => (email ?? "").trim().toLowerCase() === AUTO_PLAN_EMAIL;
