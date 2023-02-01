#! /usr/bin/python3
from http.server import HTTPServer, SimpleHTTPRequestHandler
import sys
import webbrowser

PORT = 8888

class CustomHTTPRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        SimpleHTTPRequestHandler.end_headers(self)

with HTTPServer(("", PORT), CustomHTTPRequestHandler) as httpd:
    try:
        webbrowser.open("http://localhost:%s" % PORT)
        print("serving at port", PORT)
        httpd.serve_forever()
    finally:
        sys.exit(0)
