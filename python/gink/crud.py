from json import loads, dumps
from os import environ

from .impl.directory import Directory

"""
WSGI application to GET, PUT, and DELETE data in a Gink database.

Example for PUT:

curl -X PUT http://localhost:8099/key -d 3 -H "Content-Type: application/json"

# Sets "key" in root directory to 3

Example for GET:

curl -X GET http://localhost:8099/key

# Returns 3

To run this application, pass --wsgi gink.crud.app when starting gink.

Set auth key with env AUTH_TOKEN.

"""
def app(env, start_response):
    root = Directory(arche=True)
    auth_token = environ.get("AUTH_TOKEN")

    # If auth token is present, expect token in the Authorization header.
    if auth_token:
        auth_header = env.get('HTTP_AUTHORIZATION')
        if not auth_header or auth_token not in auth_header:
            return _bad_auth_handler(start_response)

    raw_path = env.get('PATH_INFO')
    if not raw_path or raw_path == '/':
        return _bad_path_handler(start_response)

    if env.get("REQUEST_METHOD") == "GET":
        default = object()
        try:
            result = root.get(raw_path.split("/"), default)
        except KeyError:
            return _data_not_found_handler(start_response, "A subdirectory in the path does not exist.")
        if result is default:
            return _data_not_found_handler(start_response)
        return _get_handler(result, start_response)

    elif env.get("REQUEST_METHOD") == "PUT":
        request_body: bytes = env.get("wsgi.input").read()

        content_type = env.get("HTTP_CONTENT_TYPE")
        if not request_body:
            value = None
        elif content_type == "text/plain":
            value = request_body.decode()
        elif content_type == "application/json":
            value = loads(request_body.decode())
        else:
            value = request_body # Default to binary

        try:
            root.set(raw_path.split("/"), value)
        except KeyError:
            return _data_not_found_handler(start_response, "A subdirectory in the path does not exist.")

        return _set_handler(start_response)

    elif env.get("REQUEST_METHOD") == "DELETE":
        try:
            root.delete(raw_path.split("/"))
        except KeyError:
            return _data_not_found_handler(start_response, "A subdirectory in the path does not exist.")

        return _delete_handler(start_response)

    else:
        return _bad_method_handler(start_response)

def _get_handler(data, start_response):
    """
    Default response handler to return gink data in JSON format.
    """
    status = '200 OK'
    if type(data) == str:
        content_type = "text/plain"
        data = data.encode()
    if type(data) == bytes:
        content_type = "application/octet-stream"
    else:
        content_type = 'application/json'
        data = dumps(data).encode()
    headers = [('Content-type', content_type)]
    start_response(status, headers)
    assert type(data) == bytes, "data isn't bytes?"
    return [data]

def _set_handler(start_response):
    status = '201 Created'
    headers = [('Content-type', 'text/plain')]
    start_response(status, headers)
    return [b'Entry updated or created.']

def _delete_handler(start_response):
    status = '200 OK'
    headers = [('Content-type', 'text/plain')]
    start_response(status, headers)
    return [b'Entry deleted.']

def _data_not_found_handler(start_response, msg='Entry not found.'):
    status = '404 Not Found'
    headers = [('Content-type', 'text/plain')]
    start_response(status, headers)
    return [msg.encode()]

def _bad_path_handler(start_response):
    status = '400 Bad Request'
    headers = [('Content-type', 'text/plain')]
    start_response(status, headers)
    return [b'Please specify a directory/key path.']

def _bad_method_handler(start_response):
    status = '405 Method Not Allowed'
    headers = [('Content-type', 'text/plain')]
    start_response(status, headers)
    return [b'The Gink API supports GET, PUT, and DELETE.']

def _bad_auth_handler(start_response):
    status = '401 Unauthorized'
    headers = [('Content-type', 'text/plain')]
    start_response(status, headers)
    return [b'Bad auth token.']
