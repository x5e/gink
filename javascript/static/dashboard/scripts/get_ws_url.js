function getWsUrl() {
    const loc = window.location;
    let url = `ws://${loc.host}`;
    loc.port ? url += `:${loc.port}` : '';
    return url;
}