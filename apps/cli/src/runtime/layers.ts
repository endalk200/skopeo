import { CodeReviewServiceLive } from "@skopeo/code-review-agent";
import { SkopeoConfig } from "@skopeo/config";

export const configLayer = SkopeoConfig.layer;

export const codeReviewLayer = CodeReviewServiceLive;
