FROM alpine:3.19

RUN apk add --no-cache bash curl netcat-openbsd

WORKDIR /app

RUN mkdir -p app/src config logs scripts

COPY app/src/app.sh app/src/app.sh
COPY config/app.env config/app.env

RUN chmod 755 app/src/app.sh

EXPOSE 8080

CMD ["bash", "app/src/app.sh"]

