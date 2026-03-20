using Microsoft.Extensions.Hosting;

namespace Recurvos.Infrastructure.Configuration;

public static class StoragePathResolver
{
    public static string Resolve(IHostEnvironment environment, string configuredPath)
    {
        if (Path.IsPathRooted(configuredPath))
        {
            return configuredPath;
        }

        var basePath = ResolveBasePath(environment.ContentRootPath);
        return Path.GetFullPath(Path.Combine(basePath, configuredPath.Replace('/', Path.DirectorySeparatorChar)));
    }

    private static string ResolveBasePath(string contentRootPath)
    {
        var appDirectory = new DirectoryInfo(contentRootPath);
        if (appDirectory.Name.Equals("Recurvos.Api", StringComparison.OrdinalIgnoreCase)
            && appDirectory.Parent?.Name.Equals("src", StringComparison.OrdinalIgnoreCase) == true
            && appDirectory.Parent.Parent is not null)
        {
            return appDirectory.Parent.Parent.FullName;
        }

        return contentRootPath;
    }
}
