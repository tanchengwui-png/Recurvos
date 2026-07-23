# syntax=docker/dockerfile:1.7
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
ENV DOTNET_CLI_HOME=/tmp
COPY Recurvos.Api/Recurvos.Api.csproj Recurvos.Api/
COPY Recurvos.Application/Recurvos.Application.csproj Recurvos.Application/
COPY Recurvos.Infrastructure/Recurvos.Infrastructure.csproj Recurvos.Infrastructure/
COPY Recurvos.Domain/Recurvos.Domain.csproj Recurvos.Domain/
RUN --mount=type=cache,id=recurvos-nuget,target=/root/.nuget/packages \
    dotnet restore Recurvos.Api/Recurvos.Api.csproj
COPY Recurvos.Api/ Recurvos.Api/
COPY Recurvos.Application/ Recurvos.Application/
COPY Recurvos.Infrastructure/ Recurvos.Infrastructure/
COPY Recurvos.Domain/ Recurvos.Domain/
RUN --mount=type=cache,id=recurvos-nuget,target=/root/.nuget/packages \
    dotnet publish Recurvos.Api/Recurvos.Api.csproj -c Release -o /app/publish --no-restore -m:2

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app/publish .
EXPOSE 8080
ENTRYPOINT ["dotnet", "Recurvos.Api.dll"]
