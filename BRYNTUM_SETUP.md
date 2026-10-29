# Bryntum Scheduler Pro setup

Installed from the public npm registry using Bryntum’s documented trial alias:

```sh
npm install --save-exact --ignore-scripts --registry=https://registry.npmjs.org @bryntum/schedulerpro@npm:@bryntum/schedulerpro-trial@7.3.7 @bryntum/schedulerpro-react@7.3.7
```

Both direct packages are pinned to 7.3.7. The lockfile records their registry URLs and integrity hashes. No registry account or additional environment key was needed for this public trial installation.

Installation lifecycle scripts were disabled. Do not run npm rebuild or enable these scripts automatically. The trial includes a postinstall helper that rewrites JavaScript licence placeholders; it was inspected as text but not executed. Browser imports bundle successfully with scripts disabled. The production timeline subsequently rendered in the local browser with trial watermark, resources, operations and dependencies while installation scripts remained disabled. Issued evaluation/deployment coverage still needs confirmation.

The existing app passes its production build and TypeScript checks. npm audit reported zero known dependency vulnerabilities at installation; this is not a malware scan or a guarantee of safety.

The downloaded Gantt ZIP was not used, extracted, executed, or deleted. Scheduler Pro is installed for the planned worker/equipment timeline, and the operator timeline is mounted under Plan production → Production & insights. The installation itself made no Gemini calls or payments. See MANUFACTURING_BUILD_REPORT.md for subsequent isolated verification.

This is a commercial evaluation package, not an open-source component. Confirm permitted hosted-demo use and evaluation coverage before submission. Do not commit vendor package contents into the public repository.

Official references:
- https://bryntum.com/products/schedulerpro/docs/guide/SchedulerPro/quick-start/react
- https://bryntum.com/products/scheduler/docs-llm/guide/Scheduler/npm/repository/public-repository-access.md
