import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/**": ["./lib/layout/elk-worker.cjs"],
  },
};

export default withWorkflow(nextConfig);
