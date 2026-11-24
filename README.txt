ACACIA WORKSPACE

Modules
- modules/plans: original Acacia Plans source package copied from acacia-plans.zip without modifying its existing login/authentication files.
- modules/projects: Budget tab markup extracted from Acacia Books, with its budget engine and styling. The complete Acacia Books user interface is not included.

Run
Serve this folder from HTTPS or localhost (for example, deploy the folder to a static host). Open index.html. Select Plans or Projects.

Important verification notes
- Plans retains the source application's existing hosted landing/login integration and external backend configuration.
- Projects contains the extracted Budget interface and the source Books app-3 budget engine. The engine is a larger bundled script containing other Books code paths; only the Budget interface is exposed in this module.
- Projects local data uses browser localStorage keys from the source Budget implementation (including budgets and actuals). It does not automatically synchronize with a hosted Plans or Books account.
- PWA installation requires HTTPS (except localhost). Offline use is limited; authentication and external libraries require internet.
