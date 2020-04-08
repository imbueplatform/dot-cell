FROM node:10

# Install all required dependencies
RUN apt-get update

# Set the working directory
WORKDIR /cell

# Copy our dependencies
COPY *.json ./
COPY *.yml ./
COPY *.ts ./
COPY bin ./bin
COPY lib ./lib

RUN npm install
RUN npx tsc



