/** @type {import('dependency-cruiser').IConfiguration} */
const config = {
  forbidden: [
    {
      name: "domain-purity-no-other-layers",
      comment:
        "Domain layer must not import from infra, application, contracts, or apps (ARCH §2.1.B)",
      severity: "error",
      from: { path: "(?:^|/)packages/domain/" },
      to: {
        path: "(?:^|/)packages/(infra|application|contracts)/|(?:^|/)apps/",
      },
    },
    {
      name: "domain-purity-no-external-io",
      comment: "Domain layer must not import external npm or node core libraries (ARCH §2.1.B)",
      severity: "error",
      from: { path: "(?:^|/)packages/domain/" },
      to: {
        dependencyTypes: ["core", "npm", "npm-dev"],
      },
    },
    {
      name: "application-no-infra-or-apps",
      comment:
        "Application layer must only import domain and contracts; never infra or apps (ARCH §2.1.B)",
      severity: "error",
      from: { path: "(?:^|/)packages/application/" },
      to: {
        path: "(?:^|/)packages/infra/|(?:^|/)apps/",
      },
    },
    {
      name: "contracts-no-internal-packages",
      comment:
        "Contracts layer must not import from domain, application, infra, or apps (ARCH §2.1.B)",
      severity: "error",
      from: { path: "(?:^|/)packages/contracts/" },
      to: {
        path: "(?:^|/)packages/(domain|application|infra)/|(?:^|/)apps/",
      },
    },
    {
      name: "infra-no-apps",
      comment: "Infra layer must not import from apps (ARCH §2.1.B)",
      severity: "error",
      from: { path: "(?:^|/)packages/infra/" },
      to: {
        path: "(?:^|/)apps/",
      },
    },
    {
      name: "worker-no-web",
      comment: "Worker daemon must never import from web app (ARCH §2.1.B)",
      severity: "error",
      from: { path: "(?:^|/)apps/worker/" },
      to: {
        path: "(?:^|/)apps/web/",
      },
    },
    {
      name: "no-circular",
      comment: "Circular dependencies are forbidden across all layers",
      severity: "error",
      from: {},
      to: {
        circular: true,
      },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    exclude: {
      path: "(?:^|/)(\\.output|\\.nuxt|dist|coverage)/",
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
  },
};

export default config;
