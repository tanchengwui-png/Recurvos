FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
ENV MSBUILDDISABLENODEREUSE=1
ENV DOTNET_CLI_HOME=/tmp
COPY src/Recurvos.Api/Recurvos.Api.csproj src/Recurvos.Api/
COPY src/Recurvos.Application/Recurvos.Application.csproj src/Recurvos.Application/
COPY src/Recurvos.Infrastructure/Recurvos.Infrastructure.csproj src/Recurvos.Infrastructure/
COPY src/Recurvos.Domain/Recurvos.Domain.csproj src/Recurvos.Domain/
RUN dotnet restore src/Recurvos.Api/Recurvos.Api.csproj
COPY . .
RUN dotnet publish src/Recurvos.Api/Recurvos.Api.csproj -c Release -o /app/publish --no-restore -m:1 /nodeReuse:false -p:UseSharedCompilation=false -p:BuildInParallel=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app/publish .
EXPOSE 8080
ENTRYPOINT ["dotnet", "Recurvos.Api.dll"]
