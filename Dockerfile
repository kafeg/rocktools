FROM debian:bookworm-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    make \
    libpng-dev \
    libc6-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY . .
RUN make all

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpng16-16 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /src/rockcreate /usr/local/bin/
COPY --from=builder /src/rockdetail /usr/local/bin/
COPY --from=builder /src/rocksmooth /usr/local/bin/
COPY --from=builder /src/rockerode /usr/local/bin/
COPY --from=builder /src/rockconvert /usr/local/bin/
COPY --from=builder /src/rockinfo /usr/local/bin/
COPY --from=builder /src/rocktrim /usr/local/bin/

COPY samples/ /samples/

WORKDIR /output
ENTRYPOINT ["/bin/bash"]
