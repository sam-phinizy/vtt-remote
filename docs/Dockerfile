# MkDocs Material - Documentation Site
# Multi-stage build for minimal image size

FROM python:3.12-alpine AS builder

WORKDIR /docs

# Install uv and mkdocs packages
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
RUN uv pip install --system --no-cache \
    mkdocs-material \
    mkdocs-minify-plugin

# Copy docs source
COPY mkdocs.yml .
COPY docs/ docs/

# Build static site
RUN mkdocs build

# Runtime - nginx to serve static files
FROM nginx:alpine

# Copy built docs
COPY --from=builder /docs/site /usr/share/nginx/html

# Custom nginx config for SPA-style routing
RUN echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    # Cache static assets \
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ { \
        expires 7d; \
        add_header Cache-Control "public, immutable"; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
