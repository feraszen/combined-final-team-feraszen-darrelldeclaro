function requireAdmin(request, response, next) {
    if (!request.session.userId) {
        return response.redirect('/login');
    }

    if (request.session.role !== 'admin') {
        return response.status(403).send('Access denied.');
    }

    next();
}

module.exports = requireAdmin;
