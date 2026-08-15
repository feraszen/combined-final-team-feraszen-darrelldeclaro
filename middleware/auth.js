function requireAuth(request, response, next) {
    if (!request.session.userId) {
        return response.redirect('/login');
    }

    next();
}

module.exports = requireAuth;
