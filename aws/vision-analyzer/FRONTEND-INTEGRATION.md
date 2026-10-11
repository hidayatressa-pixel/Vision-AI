# Frontend AWS lifecycle integration

Deploy the SAM stack in `aws/vision-analyzer` first. The stack outputs two endpoints used by the React application:

- `VisionConfigurationApi`: `POST /Prod/config` stores a configuration snapshot in the private evidence bucket.
- `VisionSessionLifecycleApi`: `POST /Prod/session` stores session start/end lifecycle records in the private evidence bucket.

Set these variables in the frontend build environment before building the React application:

```dotenv
VITE_VISION_CONFIG_API_URL=https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com/Prod/config
VITE_VISION_SESSION_API_URL=https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com/Prod/session
```

Use the exact URLs printed by the deployed CloudFormation stack outputs; do not commit environment-specific URLs or credentials. Rebuild and redeploy the frontend after setting the variables.

The ticker reports an AWS session event as accepted only when the session endpoint returns both `accepted: true` and `success: true`. Configuration is reported as saved only after the configuration endpoint returns a successful response. Missing endpoints, non-2xx responses, and requests exceeding the 8-second timeout are reported to the user rather than being treated as success.

These endpoints record lifecycle events and configuration snapshots in S3. They do not create a continuously running Lambda process; the analyzer itself remains event-driven.
