# syntax=docker/dockerfile:1.7
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
ENV DOTNET_CLI_HOME=/tmp
COPY src/Recurvos.Api/Recurvos.Api.csproj src/Recurvos.Api/
COPY src/Recurvos.Application/Recurvos.Application.csproj src/Recurvos.Application/
COPY src/Recurvos.Infrastructure/Recurvos.Infrastructure.csproj src/Recurvos.Infrastructure/
COPY src/Recurvos.Domain/Recurvos.Domain.csproj src/Recurvos.Domain/
RUN --mount=type=cache,id=recurvos-nuget,target=/root/.nuget/packages \
    dotnet restore src/Recurvos.Api/Recurvos.Api.csproj
COPY . .
RUN --mount=type=cache,id=recurvos-nuget,target=/root/.nuget/packages \
    dotnet publish src/Recurvos.Api/Recurvos.Api.csproj -c Release -o /app/publish --no-restore -m:2

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app/publish .
EXPOSE 8080
ENTRYPOINT ["dotnet", "Recurvos.Api.dll"]
