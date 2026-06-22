import Link from "next/link";
import Image from "next/image";
import {
  Store, Truck, Users, TrendingUp, Clock, Shield,
  ArrowRight, Star, Phone, Mail, Map, CreditCard,
  Package, Headphones, Award, Globe, CheckCircle,
  Building, FileText, Camera, Layout, BarChart3,
  ShoppingBag
} from "lucide-react";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <div className="relative w-10 h-10">
                <Image
                  src="/icon/icon-512.png"
                  alt="LIA - Local International African Marketplace"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
              <span className="text-xl font-bold text-green-800">LIA</span>
              <span className="text-xs text-gray-500 hidden sm:inline">Marketplace</span>
            </Link>

            {/* Navigation */}
            <nav className="hidden md:flex items-center gap-8">
              <Link href="#how-it-works" className="text-gray-600 hover:text-green-700 transition">
                How It Works
              </Link>
              <Link href="#benefits" className="text-gray-600 hover:text-green-700 transition">
                Benefits
              </Link>
              <Link href="#faq" className="text-gray-600 hover:text-green-700 transition">
                FAQ
              </Link>
              <Link href="#contact" className="text-gray-600 hover:text-green-700 transition">
                Contact
              </Link>
            </nav>

            {/* Auth Buttons */}
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="hidden sm:inline-block px-4 py-2 text-sm font-medium text-gray-700 hover:text-green-700 transition"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="px-6 py-2 bg-gradient-to-r from-orange-600 to-orange-700 text-white text-sm font-semibold rounded-full hover:shadow-lg hover:from-orange-700 hover:to-orange-800 transition"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section - Store Owner Focus */}
      <section className="pt-20 min-h-screen flex items-center bg-gradient-to-br from-orange-50 via-white to-green-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 bg-orange-100 text-orange-700 px-4 py-2 rounded-full text-sm font-medium">
                <Store className="w-4 h-4" />
                <span>Grow Your African Grocery Business</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
                Grow Your Business with{" "}
                <span className="text-orange-600">LIA's</span>
                <br />
                Delivery Platform
              </h1>

              <p className="text-xl text-gray-600 max-w-lg">
                Join the platform that connects you to thousands of customers looking for 
                authentic African groceries. Get more orders, expand your reach, and grow your business.
              </p>

              <div className="flex flex-wrap gap-4">
                <Link
                  href="/register"
                  className="px-8 py-4 bg-gradient-to-r from-orange-600 to-orange-700 text-white font-semibold rounded-full hover:shadow-xl hover:from-orange-700 hover:to-orange-800 transition flex items-center gap-2"
                >
                  Partner with LIA <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  href="#how-it-works"
                  className="px-8 py-4 border-2 border-gray-300 text-gray-700 font-semibold rounded-full hover:border-orange-600 hover:text-orange-600 transition"
                >
                  Learn More
                </Link>
              </div>

              <div className="flex items-center gap-6 pt-4 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span>No upfront fees</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span>Free tablet &amp; software</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span>24/7 support</span>
                </div>
              </div>
            </div>

            {/* Right Image */}
            <div className="relative lg:block">
              <div className="relative rounded-3xl overflow-hidden shadow-2xl">
                <div className="aspect-w-4 aspect-h-3 bg-gradient-to-br from-orange-400 to-green-400">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-white text-center p-8">
                      <Store className="w-24 h-24 mx-auto mb-4 opacity-80" />
                      <p className="text-2xl font-bold">Join 500+ Stores</p>
                      <p className="text-lg opacity-90">Selling on LIA Marketplace</p>
                    </div>
                  </div>
                </div>
                {/* Floating badges */}
                <div className="absolute -top-4 -right-4 bg-white rounded-2xl shadow-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                      <TrendingUp className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <div className="text-sm font-bold">+40% Growth</div>
                      <div className="text-xs text-gray-500">Average sales increase</div>
                    </div>
                  </div>
                </div>
                <div className="absolute -bottom-4 -left-4 bg-white rounded-2xl shadow-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                      <Users className="w-6 h-6 text-orange-600" />
                    </div>
                    <div>
                      <div className="text-sm font-bold">10K+ Customers</div>
                      <div className="text-xs text-gray-500">Active monthly shoppers</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works - Store Owner Focus */}
      <section id="how-it-works" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <p className="text-sm font-semibold uppercase tracking-wide text-orange-600">
              How It Works
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">
              Get Your Store Online in 3 Steps
            </h2>
            <p className="text-xl text-gray-600 mt-4">
              Start selling your African groceries to thousands of customers in your area.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                icon: FileText,
                title: "Sign Up",
                description: "Fill out our simple signup form. Share your store details and location so we can verify and set you up."
              },
              {
                step: "2",
                icon: Camera,
                title: "Setup Your Store",
                description: "Upload your products, pricing, and photos. We'll help you create a professional storefront."
              },
              {
                step: "3",
                icon: Truck,
                title: "Start Taking Orders",
                description: "Begin receiving orders from customers. We'll handle delivery and payments while you focus on your business."
              }
            ].map((item, index) => (
              <div key={index} className="relative group">
                <div className="bg-gray-50 rounded-2xl p-8 group-hover:shadow-xl transition">
                  <div className="w-16 h-16 bg-orange-100 rounded-xl flex items-center justify-center mb-6">
                    <item.icon className="w-8 h-8 text-orange-600" />
                  </div>
                  <div className="absolute top-6 right-6 text-4xl font-bold text-gray-200">
                    {item.step}
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">{item.title}</h3>
                  <p className="text-gray-600">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="benefits" className="py-20 bg-gradient-to-br from-orange-50 to-green-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <p className="text-sm font-semibold uppercase tracking-wide text-orange-600">
              Why Partner with LIA
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">
              Grow Your Business with Confidence
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                icon: Users,
                title: "Expand Your Reach",
                description: "Increase visibility and gain new customers by featuring your store on the LIA platform."
              },
              {
                icon: Truck,
                title: "Reliable Delivery",
                description: "Offer customers flexible delivery options with our powerful network of drivers."
              },
              {
                icon: Layout,
                title: "Easy Management",
                description: "Use our merchant dashboard to manage orders, products, and payments seamlessly."
              },
              {
                icon: BarChart3,
                title: "Data Insights",
                description: "Get valuable insights about your sales, customers, and business performance."
              }
            ].map((benefit, index) => (
              <div key={index} className="bg-white rounded-2xl p-6 hover:shadow-xl transition">
                <div className="w-14 h-14 bg-orange-100 rounded-xl flex items-center justify-center mb-4">
                  <benefit.icon className="w-7 h-7 text-orange-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">{benefit.title}</h3>
                <p className="text-gray-600 mt-2">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Customer Journey Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <p className="text-sm font-semibold uppercase tracking-wide text-orange-600">
              Customer Journey
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">
              From Order to Delivery
            </h2>
            <p className="text-xl text-gray-600 mt-4">
              See how customers discover, order, and receive their African groceries.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Store,
                title: "Discover Your Store",
                description: "Customers browse African grocery stores in their area and find your products."
              },
              {
                icon: ShoppingBag,
                title: "Place an Order",
                description: "Customers add items to their cart and checkout securely through the platform."
              },
              {
                icon: Truck,
                title: "Fast Delivery",
                description: "Our delivery network picks up from your store and delivers to customers quickly."
              }
            ].map((item, index) => (
              <div key={index} className="relative">
                <div className="bg-gray-50 rounded-2xl p-8 text-center">
                  <div className="w-20 h-20 bg-gradient-to-r from-orange-400 to-orange-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <item.icon className="w-10 h-10 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">{item.title}</h3>
                  <p className="text-gray-600">{item.description}</p>
                </div>
                {index < 2 && (
                  <div className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2">
                    <ArrowRight className="w-8 h-8 text-orange-300" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <p className="text-sm font-semibold uppercase tracking-wide text-orange-600">
              Questions? We've Got Answers
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-6">
            {[
              {
                q: "How long does it take to become a partner?",
                a: "Depending on how many locations you have, it's possible to become an LIA partner and start accepting orders in just a few days! You can begin the process by signing up here. We're excited to work with you."
              },
              {
                q: "How does pricing work?",
                a: "LIA pricing has two parts. A one-time activation fee sets stores up with a welcome kit, tablet, store software, and professional photo shoot. A service fee is calculated as a percentage of each order made through LIA."
              },
              {
                q: "Who handles each delivery?",
                a: "The LIA platform connects you with independent drivers who deliver to your customers. Because of our network of delivery drivers, stores don't have to keep their own delivery staff. But if you do have your own staff, we're flexible—you can use them too."
              },
              {
                q: "What is the delivery radius?",
                a: "This varies from city to city. We assess delivery coverage and your location to help define the right area for your store. Typically, we cover a 5-10 mile radius depending on your area."
              },
              {
                q: "What tools do I get as a partner?",
                a: "You receive a tablet with LIA Orders to keep track of new orders and manage deliveries daily. LIA Manager software gives deeper access to menus, payment information, sales data, and customer insights. We've got a tech team ensuring everything runs smoothly."
              }
            ].map((faq, index) => (
              <div key={index} className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{faq.q}</h3>
                <p className="text-gray-600">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section - Store Focus */}
      <section className="py-20 bg-gradient-to-r from-orange-600 to-orange-700">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Ready to Grow Your Business?
          </h2>
          <p className="text-xl text-orange-100 mb-8">
            Join thousands of store owners already selling on LIA Marketplace.
            Get started today and reach new customers.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-8 py-4 bg-white text-orange-700 font-semibold rounded-full hover:shadow-xl transition"
            >
              Get Started <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="#contact"
              className="inline-flex items-center gap-2 px-8 py-4 border-2 border-white text-white font-semibold rounded-full hover:bg-white/10 transition"
            >
              Contact Sales <Phone className="w-5 h-5" />
            </Link>
          </div>
          <p className="text-orange-100 text-sm mt-6">
            Or call us at <a href="tel:+1234567890" className="font-bold hover:underline">(833) 672-4143</a>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="bg-gray-900 text-gray-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid md:grid-cols-4 gap-12">
            {/* Company Info */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="relative w-10 h-10">
                  <Image
                    src="/icon/icon-512.png"
                    alt="LIA"
                    fill
                    className="object-contain"
                  />
                </div>
                <span className="text-xl font-bold text-white">LIA</span>
              </div>
              <p className="text-sm text-gray-400">
                Connecting African grocery stores with customers for fast and reliable delivery.
              </p>
              <div className="flex items-center gap-4 mt-4">
                <a href="#" className="text-gray-400 hover:text-white transition">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/>
                  </svg>
                </a>
                <a href="#" className="text-gray-400 hover:text-white transition">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.627 0-12 5.373-12 12 0 5.302 3.438 9.8 8.205 11.387.6.113.82-.26.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.73.083-.73 1.205.084 1.838 1.237 1.838 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.468-2.381 1.235-3.221-.123-.3-.535-1.52.117-3.16 0 0 1.008-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.29-1.552 3.297-1.23 3.297-1.23.653 1.64.24 2.86.118 3.16.768.84 1.233 1.91 1.233 3.22 0 4.61-2.804 5.62-5.476 5.92.43.37.824 1.102.824 2.22 0 1.602-.015 2.894-.015 3.287 0 .318.216.694.825.577C20.565 21.795 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                  </svg>
                </a>
                <a href="#" className="text-gray-400 hover:text-white transition">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                </a>
              </div>
            </div>

            {/* For Store Owners */}
            <div>
              <h3 className="text-white font-semibold mb-4">For Store Owners</h3>
              <ul className="space-y-2 text-sm">
                <li><Link href="#" className="hover:text-white transition">Partner with LIA</Link></li>
                <li><Link href="#" className="hover:text-white transition">Pricing</Link></li>
                <li><Link href="#" className="hover:text-white transition">Dashboard</Link></li>
                <li><Link href="#" className="hover:text-white transition">Delivery Logistics</Link></li>
              </ul>
            </div>

            {/* For Customers */}
            <div>
              <h3 className="text-white font-semibold mb-4">For Customers</h3>
              <ul className="space-y-2 text-sm">
                <li><Link href="#" className="hover:text-white transition">Browse Stores</Link></li>
                <li><Link href="#" className="hover:text-white transition">Delivery</Link></li>
                <li><Link href="#" className="hover:text-white transition">FAQ</Link></li>
                <li><Link href="#" className="hover:text-white transition">Support</Link></li>
              </ul>
            </div>

            {/* Contact Form */}
            <div>
              <h3 className="text-white font-semibold mb-4">Contact Us</h3>
              <form className="space-y-3">
                <input
                  type="email"
                  placeholder="Your email"
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <textarea
                  placeholder="Your message"
                  rows={3}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <button
                  type="submit"
                  className="w-full px-4 py-2 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 transition"
                >
                  Send Message
                </button>
              </form>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-gray-800 mt-12 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm">
            <p className="text-gray-400">
              &copy; {new Date().getFullYear()} LIA Marketplace. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <Link href="#" className="text-gray-400 hover:text-white transition">
                Privacy Policy
              </Link>
              <Link href="#" className="text-gray-400 hover:text-white transition">
                Terms of Service
              </Link>
              <Link href="#" className="text-gray-400 hover:text-white transition">
                Cookie Policy
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}