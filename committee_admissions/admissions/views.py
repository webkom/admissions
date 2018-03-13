from django.shortcuts import render


def landing_page(request):
    return render(request, 'admissions/landing_page.html')


def dashboard(request):
    return render(request, 'admissions/dashboard.html')

